pub const PRODUCT_NAME: &str = "Kempt";
pub const PRODUCT_NAME_ZH: &str = "企理";
pub const BUNDLE_ID: &str = "com.kempt.workflow";
pub const DATABASE_FILE: &str = "kempt.db";
pub const SERVER_BINARY: &str = "kempt-server";
pub const BACKUP_FORMAT_V3: &str = "kempt-full-backup";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_build_names_contain_no_cjk() {
        for value in [PRODUCT_NAME, SERVER_BINARY, DATABASE_FILE, BUNDLE_ID] {
            assert!(value.is_ascii(), "non-ASCII build name: {value}");
        }
        assert_eq!(PRODUCT_NAME, "Kempt");
        assert_eq!(BUNDLE_ID, "com.kempt.workflow");
    }
}
