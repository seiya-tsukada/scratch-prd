"""idea_ws の権限と RLS: Supabase の既定ロールからは何も見えず、idea_ws_app だけが必要最小限の操作をできる"""

from __future__ import annotations

import psycopg
import pytest
from psycopg import errors, sql

from .helpers import create_user

SUPABASE_API_ROLES = ["anon", "authenticated", "service_role"]
TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]
CONTENT_TABLES = {"section_templates", "sample_contents"}


def idea_ws_tables(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute(
        """
        select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'idea_ws' and c.relkind in ('r', 'v', 'm', 'p')
        order by c.relname
        """
    ).fetchall()
    return [r[0] for r in rows]


def idea_ws_functions(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute(
        """
        select p.oid::regprocedure::text
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'idea_ws'
        order by 1
        """
    ).fetchall()
    return [r[0] for r in rows]


def test_all_expected_tables_exist(admin: psycopg.Connection) -> None:
    assert set(idea_ws_tables(admin)) == {
        "users",
        "user_identities",
        "sessions",
        "email_login_tokens",
        "oauth_states",
        "projects",
        "sections",
        "notes",
        "prd_documents",
        "prd_versions",
        "workspace_preferences",
        "section_templates",
        "sample_contents",
        "events",
        "ai_generations",
        "api_usage",
        "rate_limit_buckets",
        "password_credentials",
    }


def test_no_tables_in_public_schema(admin: psycopg.Connection) -> None:
    rows = admin.execute(
        """
        select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
        """
    ).fetchall()
    assert rows == []


@pytest.mark.parametrize("role", [*SUPABASE_API_ROLES, "public"])
def test_api_roles_have_no_privileges_on_schema(admin: psycopg.Connection, role: str) -> None:
    assert admin.execute("select has_schema_privilege(%s, 'idea_ws', 'USAGE')", (role,)).fetchone() == (False,)

    for table in idea_ws_tables(admin):
        for privilege in TABLE_PRIVILEGES:
            granted = admin.execute(
                "select has_table_privilege(%s, %s, %s)", (role, f"idea_ws.{table}", privilege)
            ).fetchone()
            assert granted == (False,), f"{role} has {privilege} on idea_ws.{table}"

    for function in idea_ws_functions(admin):
        granted = admin.execute("select has_function_privilege(%s, %s, 'EXECUTE')", (role, function)).fetchone()
        assert granted == (False,), f"{role} can execute {function}"


@pytest.mark.parametrize("role", SUPABASE_API_ROLES)
def test_api_roles_cannot_read_or_write(admin: psycopg.Connection, role: str) -> None:
    admin.execute(sql.SQL("set local role {}").format(sql.Identifier(role)))

    for table in idea_ws_tables(admin):
        with pytest.raises(errors.InsufficientPrivilege), admin.transaction():
            admin.execute(sql.SQL("select * from idea_ws.{} limit 1").format(sql.Identifier(table)))

    with pytest.raises(errors.InsufficientPrivilege), admin.transaction():
        admin.execute("insert into idea_ws.users (is_guest) values (true)")

    with pytest.raises(errors.InsufficientPrivilege), admin.transaction():
        admin.execute("select idea_ws.consume_quota(gen_random_uuid(), 'prd', 10)")


def test_rls_enabled_on_every_table(admin: psycopg.Connection) -> None:
    rows = admin.execute(
        """
        select c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'idea_ws' and c.relkind = 'r' and not c.relrowsecurity
        """
    ).fetchall()
    assert rows == []


def test_policies_target_only_app_role(admin: psycopg.Connection) -> None:
    rows = admin.execute("select tablename, roles from pg_policies where schemaname = 'idea_ws'").fetchall()
    assert {r[0] for r in rows} == set(idea_ws_tables(admin))
    assert all(r[1] == ["idea_ws_app"] for r in rows)


def test_app_role_cannot_bypass_rls_or_administer(admin: psycopg.Connection) -> None:
    row = admin.execute(
        "select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = 'idea_ws_app'"
    ).fetchone()
    assert row == (False, False, False, False)


def test_app_role_privileges(admin: psycopg.Connection) -> None:
    for table in idea_ws_tables(admin):
        expected = {"SELECT"} if table in CONTENT_TABLES else {"SELECT", "INSERT", "UPDATE", "DELETE"}
        granted = {
            privilege
            for privilege in TABLE_PRIVILEGES
            if admin.execute(
                "select has_table_privilege('idea_ws_app', %s, %s)", (f"idea_ws.{table}", privilege)
            ).fetchone()
            == (True,)
        }
        assert granted == expected, table


def test_app_role_can_use_user_data_tables(app: psycopg.Connection) -> None:
    user_id = create_user(app)
    app.execute("insert into idea_ws.projects (user_id, name) values (%s, 'P')", (user_id,))
    app.execute("update idea_ws.projects set name = 'Q' where user_id = %s", (user_id,))
    assert app.execute("select name from idea_ws.projects where user_id = %s", (user_id,)).fetchone() == ("Q",)
    app.execute("delete from idea_ws.users where id = %s", (user_id,))


def test_app_role_reads_but_cannot_edit_content(app: psycopg.Connection) -> None:
    assert app.execute("select count(*) from idea_ws.section_templates").fetchone() == (4,)
    with pytest.raises(errors.InsufficientPrivilege), app.transaction():
        app.execute("insert into idea_ws.section_templates (name, position) values ('x', 9)")
    with pytest.raises(errors.InsufficientPrivilege), app.transaction():
        app.execute("update idea_ws.sample_contents set is_active = false")


def test_app_role_cannot_create_objects(app: psycopg.Connection) -> None:
    with pytest.raises(errors.InsufficientPrivilege), app.transaction():
        app.execute("create table idea_ws.evil (id int)")
    with pytest.raises(errors.InsufficientPrivilege), app.transaction():
        app.execute("create table public.evil (id int)")


def test_app_role_email_is_case_insensitive(app: psycopg.Connection) -> None:
    """idea_ws_app の search_path で citext の演算子が使われ、大文字小文字を区別せずに一致する"""
    user_id = create_user(app, is_guest=False, email="Alice@Example.com")
    row = app.execute("select id from idea_ws.users where email = %s", ("alice@example.com",)).fetchone()
    assert row is not None and str(row[0]) == str(user_id)

    with pytest.raises(errors.UniqueViolation), app.transaction():
        create_user(app, is_guest=False, email="ALICE@example.com")
