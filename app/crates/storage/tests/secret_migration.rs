use kempt_core::secrets::{MemorySecretStore, SecretStore};
use kempt_storage::migrate_credentials;

#[test]
fn migrates_credentials_by_reference_without_exposing_values() {
    let legacy = MemorySecretStore::default();
    let current = MemorySecretStore::default();
    legacy.set("assistant-model/one", "secret").unwrap();
    migrate_credentials(&["assistant-model/one".into()], &legacy, &current).unwrap();
    assert_eq!(current.get("assistant-model/one").unwrap(), "secret");
}

#[test]
fn empty_references_succeed() {
    let legacy = MemorySecretStore::default();
    let current = MemorySecretStore::default();
    migrate_credentials(&[], &legacy, &current).unwrap();
}

#[test]
fn missing_credential_aborts_without_deleting_legacy_value() {
    let legacy = MemorySecretStore::default();
    let current = MemorySecretStore::default();
    legacy.set("assistant-model/one", "secret").unwrap();
    let result = migrate_credentials(&["assistant-model/missing".into()], &legacy, &current);
    assert!(result.is_err());
    assert_eq!(legacy.get("assistant-model/one").unwrap(), "secret");
}
