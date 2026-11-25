import argparse
import getpass

from pwdlib import PasswordHash

from app.db.connection import get_connection


def main():
    parser = argparse.ArgumentParser(description="Create an initial LeaveHQ administrator.")
    parser.add_argument(
        "--confirm-create-admin",
        action="store_true",
        help="Confirm that this command should insert an administrator account.",
    )
    args = parser.parse_args()
    if not args.confirm_create_admin:
        parser.error("Pass --confirm-create-admin to explicitly create an administrator.")

    username = input("Administrator username: ").strip()
    if not username:
        parser.error("Username cannot be empty.")
    password = getpass.getpass("Administrator password: ")
    confirmation = getpass.getpass("Confirm administrator password: ")
    if len(password) < 14:
        parser.error("Use a password with at least 14 characters.")
    if password != confirmation:
        parser.error("Passwords do not match.")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO admins (username, password_hash, is_active)
                VALUES (%s, %s, TRUE)
                """,
                (username, PasswordHash.recommended().hash(password)),
            )
        connection.commit()
        print("Administrator account created.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
