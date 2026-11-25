def upgrade_leave_schema() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cur:
            cur.execute("""
                ALTER TABLE leave_records
                ADD COLUMN IF NOT EXISTS duration_type VARCHAR(20) NOT NULL DEFAULT 'full_day'
            """)
            cur.execute("ALTER TABLE leave_records ADD COLUMN IF NOT EXISTS start_time TIME")
            cur.execute("ALTER TABLE leave_records ADD COLUMN IF NOT EXISTS end_time TIME")
            cur.execute("ALTER TABLE leave_records ADD COLUMN IF NOT EXISTS total_hours NUMERIC(6,2)")
            cur.execute("""
                UPDATE leave_records SET total_hours = total_days * 8
                WHERE total_hours IS NULL
            """)
            cur.execute("""
                SELECT 1 FROM pg_constraint
                WHERE conname = 'leave_duration_type_check'
            """)
            if not cur.fetchone():
                cur.execute("""
                    ALTER TABLE leave_records
                    ADD CONSTRAINT leave_duration_type_check
                    CHECK (duration_type IN ('full_day','first_half','second_half','custom_hours'))
                """)
        connection.commit()
        print("LeaveHQ time-based database upgrade complete.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    upgrade_leave_schema()
