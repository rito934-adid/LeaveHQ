import re
from pathlib import Path
from app.db.connection import get_connection


def initialize_database():
    schema_path = Path(__file__).parent / "app" / "db" / "schema.sql"
    schema = schema_path.read_text(encoding="utf-8")

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            for statement in re.split(r";\s*(?:\n|$)", schema.strip()):
                statement = statement.strip()
                if statement:
                    cursor.execute(statement)

        connection.commit()
        print("LeaveHQ database initialized successfully!")

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()


if __name__ == "__main__":
    initialize_database()
