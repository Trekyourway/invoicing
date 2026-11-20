CREATE TABLE IF NOT EXISTS payments (
 id VARCHAR(36) PRIMARY KEY,
 source_provider VARCHAR(24) NOT NULL,
 source_reference VARCHAR(180) NOT NULL,
 source_key CHAR(64) NOT NULL UNIQUE,
 customer_name VARCHAR(180) NULL,
 customer_email VARCHAR(254) NULL,
 description VARCHAR(280) NULL,
 amount_ils DECIMAL(13,2) NULL,
 payment_date DATE NULL,
 payment_method VARCHAR(30) NULL,
 evidence_file_id VARCHAR(200) NULL,
 status VARCHAR(40) NOT NULL DEFAULT 'NEEDS_DETAILS',
 verified_at DATETIME(3) NULL,
 verified_note VARCHAR(250) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX ix_status (status), INDEX ix_match (customer_email, amount_ils, payment_date)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS receipt_attempts (
 payment_id VARCHAR(36) PRIMARY KEY,
 attempt_id VARCHAR(36) NOT NULL UNIQUE,
 provider_env VARCHAR(20) NOT NULL,
 status VARCHAR(40) NOT NULL DEFAULT 'ISSUANCE_UNKNOWN',
 document_id VARCHAR(150) NULL,
 pdf_url TEXT NULL,
 email_requested TINYINT NOT NULL DEFAULT 0,
 email_acknowledged TINYINT NOT NULL DEFAULT 0,
 archive_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
 archive_file_id VARCHAR(200) NULL,
 archive_checksum CHAR(64) NULL,
 last_error VARCHAR(150) NULL,
 started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 finished_at DATETIME(3) NULL,
 CONSTRAINT fk_attempt_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS evidence_files (
 drive_file_id VARCHAR(200) PRIMARY KEY,
 payment_id VARCHAR(36) NOT NULL,
 seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 CONSTRAINT fk_evidence_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS audit_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 payment_id VARCHAR(36) NOT NULL,
 action VARCHAR(50) NOT NULL,
 actor VARCHAR(50) NOT NULL,
 occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX ix_audit_payment (payment_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;