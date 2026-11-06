"""テーブル定義の制約: 所有者の一致、cascade / set null、updated_at トリガーなど"""

from __future__ import annotations

import psycopg
import pytest
from psycopg import errors
from psycopg.types.json import Jsonb

from .helpers import create_project, create_user


def test_child_rows_must_belong_to_same_user(app: psycopg.Connection) -> None:
    alice = create_user(app)
    bob = create_user(app)
    alice_project = create_project(app, alice)

    # 他人のプロジェクトにメモ・PRD・設定を作れない
    with pytest.raises(errors.ForeignKeyViolation), app.transaction():
        app.execute(
            "insert into idea_ws.notes (user_id, project_id) values (%s, %s)",
            (bob, alice_project),
        )
    with pytest.raises(errors.ForeignKeyViolation), app.transaction():
        app.execute(
            "insert into idea_ws.prd_documents (user_id, project_id, title, generation_mode) "
            "values (%s, %s, 'T', 'strict')",
            (bob, alice_project),
        )
    with pytest.raises(errors.ForeignKeyViolation), app.transaction():
        app.execute(
            "insert into idea_ws.workspace_preferences (user_id, project_id, active_pane_id) values (%s, %s, 'pane-0')",
            (bob, alice_project),
        )


def test_prd_version_must_belong_to_same_user(app: psycopg.Connection) -> None:
    alice = create_user(app)
    bob = create_user(app)
    project = create_project(app, alice)
    row = app.execute(
        "insert into idea_ws.prd_documents (user_id, project_id, title, generation_mode) "
        "values (%s, %s, 'T', 'suggest') returning id",
        (alice, project),
    ).fetchone()
    assert row is not None

    with pytest.raises(errors.ForeignKeyViolation), app.transaction():
        app.execute(
            "insert into idea_ws.prd_versions "
            "(user_id, prd_document_id, version_number, title, content, generation_mode, detail_level) "
            "values (%s, %s, 1, 'T', '', 'suggest', 'standard')",
            (bob, row[0]),
        )


def test_deleting_user_cascades_user_data_and_keeps_metrics(app: psycopg.Connection) -> None:
    user = create_user(app)
    project = create_project(app, user)
    app.execute(
        "insert into idea_ws.notes (user_id, project_id, content) values (%s, %s, 'x')",
        (user, project),
    )
    prd = app.execute(
        "insert into idea_ws.prd_documents (user_id, project_id, title, generation_mode) "
        "values (%s, %s, 'T', 'suggest') returning id",
        (user, project),
    ).fetchone()
    assert prd is not None
    app.execute(
        "insert into idea_ws.prd_versions "
        "(user_id, prd_document_id, version_number, title, content, generation_mode, detail_level) "
        "values (%s, %s, 1, 'T', '', 'suggest', 'standard')",
        (user, prd[0]),
    )
    app.execute(
        "insert into idea_ws.workspace_preferences (user_id, project_id, active_pane_id) values (%s, %s, 'pane-0')",
        (user, project),
    )
    app.execute(
        "insert into idea_ws.user_identities (user_id, provider, provider_subject) values (%s, 'google', 'sub')",
        (user,),
    )
    session = app.execute(
        "insert into idea_ws.sessions (user_id, token_hash, expires_at) "
        "values (%s, '\\x01', now() + interval '1 day') returning id",
        (user,),
    ).fetchone()
    assert session is not None
    app.execute("select idea_ws.consume_quota(%s, 'prd', 5)", (user,))
    event = app.execute(
        "insert into idea_ws.events (user_id, session_id, event_name, properties) values (%s, %s, 'app_opened', %s) "
        "returning id",
        (user, session[0], Jsonb({})),
    ).fetchone()
    generation = app.execute(
        "insert into idea_ws.ai_generations (user_id, kind) values (%s, 'prd') returning id", (user,)
    ).fetchone()
    assert event is not None and generation is not None

    app.execute("delete from idea_ws.users where id = %s", (user,))

    for table in [
        "projects",
        "notes",
        "prd_documents",
        "prd_versions",
        "workspace_preferences",
        "user_identities",
        "sessions",
        "api_usage",
    ]:
        count = app.execute(f"select count(*) from idea_ws.{table} where user_id = %s", (user,)).fetchone()
        assert count == (0,), table

    # 計測データは匿名化して残す
    assert app.execute("select user_id, session_id from idea_ws.events where id = %s", (event[0],)).fetchone() == (
        None,
        None,
    )
    assert app.execute("select user_id from idea_ws.ai_generations where id = %s", (generation[0],)).fetchone() == (
        None,
    )


def test_moving_a_project_to_another_user_moves_everything_under_it(app: psycopg.Connection) -> None:
    """ゲストのデータ統合: projects.user_id の書き換えが配下のテーブルへ cascade する"""
    guest = create_user(app)
    owner = create_user(app, is_guest=False, email="owner@example.com")
    project = create_project(app, guest)
    note = app.execute(
        "insert into idea_ws.notes (user_id, project_id, content) values (%s, %s, 'x') returning id",
        (guest, project),
    ).fetchone()
    assert note is not None
    tag = app.execute(
        "insert into idea_ws.tags (user_id, project_id, name) values (%s, %s, 'T') returning id",
        (guest, project),
    ).fetchone()
    assert tag is not None
    app.execute(
        "insert into idea_ws.note_tags (note_id, tag_id, user_id, project_id) values (%s, %s, %s, %s)",
        (note[0], tag[0], guest, project),
    )
    prd = app.execute(
        "insert into idea_ws.prd_documents (user_id, project_id, title, generation_mode) "
        "values (%s, %s, 'T', 'suggest') returning id",
        (guest, project),
    ).fetchone()
    assert prd is not None
    app.execute(
        "insert into idea_ws.prd_versions "
        "(user_id, prd_document_id, version_number, title, content, generation_mode, detail_level) "
        "values (%s, %s, 1, 'T', '', 'suggest', 'standard')",
        (guest, prd[0]),
    )
    app.execute(
        "insert into idea_ws.workspace_preferences (user_id, project_id, active_pane_id) values (%s, %s, 'pane-0')",
        (guest, project),
    )

    app.execute("update idea_ws.projects set user_id = %s where user_id = %s", (owner, guest))

    tables = ["projects", "notes", "tags", "note_tags", "prd_documents", "prd_versions", "workspace_preferences"]
    for table in tables:
        moved = app.execute(f"select count(*) from idea_ws.{table} where user_id = %s", (owner,)).fetchone()
        left = app.execute(f"select count(*) from idea_ws.{table} where user_id = %s", (guest,)).fetchone()
        assert (moved, left) == ((1,), (0,)), table


def test_tag_names_are_unique_per_project_ignoring_case(app: psycopg.Connection) -> None:
    user = create_user(app)
    project = create_project(app, user)
    other_project = create_project(app, user)
    app.execute("insert into idea_ws.tags (user_id, project_id, name) values (%s, %s, 'MVP')", (user, project))
    app.execute("insert into idea_ws.tags (user_id, project_id, name) values (%s, %s, 'mvp')", (user, other_project))
    with pytest.raises(errors.UniqueViolation), app.transaction():
        app.execute("insert into idea_ws.tags (user_id, project_id, name) values (%s, %s, 'mvp')", (user, project))


def test_note_and_tag_must_be_in_same_project(app: psycopg.Connection) -> None:
    user = create_user(app)
    project = create_project(app, user)
    other_project = create_project(app, user)
    note = app.execute(
        "insert into idea_ws.notes (user_id, project_id) values (%s, %s) returning id", (user, project)
    ).fetchone()
    tag = app.execute(
        "insert into idea_ws.tags (user_id, project_id, name) values (%s, %s, 'T') returning id",
        (user, other_project),
    ).fetchone()
    assert note is not None and tag is not None
    with pytest.raises(errors.ForeignKeyViolation), app.transaction():
        app.execute(
            "insert into idea_ws.note_tags (note_id, tag_id, user_id, project_id) values (%s, %s, %s, %s)",
            (note[0], tag[0], user, project),
        )


def test_deleting_a_tag_or_note_removes_its_links(app: psycopg.Connection) -> None:
    user = create_user(app)
    project = create_project(app, user)
    note = app.execute(
        "insert into idea_ws.notes (user_id, project_id) values (%s, %s) returning id", (user, project)
    ).fetchone()
    tags = app.execute(
        "insert into idea_ws.tags (user_id, project_id, name) values (%s, %s, 'A'), (%s, %s, 'B') returning id",
        (user, project, user, project),
    ).fetchall()
    assert note is not None
    for (tag_id,) in tags:
        app.execute(
            "insert into idea_ws.note_tags (note_id, tag_id, user_id, project_id) values (%s, %s, %s, %s)",
            (note[0], tag_id, user, project),
        )

    app.execute("delete from idea_ws.tags where id = %s", (tags[0][0],))
    assert app.execute("select count(*) from idea_ws.note_tags").fetchone() == (1,)
    app.execute("delete from idea_ws.notes where id = %s", (note[0],))
    assert app.execute("select count(*) from idea_ws.note_tags").fetchone() == (0,)
    assert app.execute("select count(*) from idea_ws.tags where user_id = %s", (user,)).fetchone() == (1,)


def test_updated_at_is_set_on_update(admin: psycopg.Connection) -> None:
    user = create_user(admin)
    row = admin.execute(
        "insert into idea_ws.projects (user_id, name, created_at, updated_at) "
        "values (%s, 'P', now() - interval '1 day', now() - interval '1 day') returning id",
        (user,),
    ).fetchone()
    assert row is not None

    admin.execute("update idea_ws.projects set name = 'Q' where id = %s", (row[0],))
    result = admin.execute(
        "select updated_at = now(), created_at < now() from idea_ws.projects where id = %s", (row[0],)
    ).fetchone()
    assert result == (True, True)


def test_registered_user_requires_email(app: psycopg.Connection) -> None:
    with pytest.raises(errors.CheckViolation), app.transaction():
        create_user(app, is_guest=False, email=None)


def test_identity_is_unique_per_provider_subject(app: psycopg.Connection) -> None:
    alice = create_user(app)
    bob = create_user(app)
    app.execute(
        "insert into idea_ws.user_identities (user_id, provider, provider_subject) values (%s, 'google', 's1')",
        (alice,),
    )
    with pytest.raises(errors.UniqueViolation), app.transaction():
        app.execute(
            "insert into idea_ws.user_identities (user_id, provider, provider_subject) values (%s, 'google', 's1')",
            (bob,),
        )


def test_only_one_active_sample(admin: psycopg.Connection) -> None:
    with pytest.raises(errors.UniqueViolation), admin.transaction():
        admin.execute("insert into idea_ws.sample_contents (version, is_active, content) values (99, true, '{}')")


def test_prd_generation_mode_accepts_unknown(app: psycopg.Connection) -> None:
    """旧データ（PRD セクションのメモ）から変換した PRD は生成モードが不明（'unknown'）"""
    user = create_user(app)
    project = create_project(app, user)
    prd = app.execute(
        "insert into idea_ws.prd_documents (user_id, project_id, title, generation_mode) "
        "values (%s, %s, 'T', 'unknown') returning id",
        (user, project),
    ).fetchone()
    assert prd is not None
    app.execute(
        "insert into idea_ws.prd_versions "
        "(user_id, prd_document_id, version_number, title, content, generation_mode, detail_level) "
        "values (%s, %s, 1, 'T', '', 'unknown', 'standard')",
        (user, prd[0]),
    )


@pytest.mark.parametrize(
    ("column", "value"),
    [("generation_mode", "creative"), ("detail_level", "huge")],
)
def test_prd_enum_columns_are_checked(app: psycopg.Connection, column: str, value: str) -> None:
    user = create_user(app)
    project = create_project(app, user)
    values = {"generation_mode": "suggest", "detail_level": "standard", column: value}
    with pytest.raises(errors.CheckViolation), app.transaction():
        app.execute(
            "insert into idea_ws.prd_documents (user_id, project_id, title, generation_mode, detail_level) "
            "values (%s, %s, 'T', %s, %s)",
            (user, project, values["generation_mode"], values["detail_level"]),
        )
