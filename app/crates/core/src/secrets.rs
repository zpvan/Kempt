use crate::error::AppError;
use std::{collections::HashMap, sync::Mutex};

pub trait SecretStore: Send + Sync {
    fn get(&self, reference: &str) -> Result<String, AppError>;
    fn set(&self, reference: &str, value: &str) -> Result<(), AppError>;
    fn delete(&self, reference: &str) -> Result<(), AppError>;
}

#[derive(Default)]
pub struct MemorySecretStore {
    values: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemorySecretStore {
    fn get(&self, reference: &str) -> Result<String, AppError> {
        self.values
            .lock()
            .map_err(|_| AppError::SecretStore("Secret store lock failed".into()))?
            .get(reference)
            .cloned()
            .ok_or_else(|| AppError::SecretStore("Credential not found".into()))
    }

    fn set(&self, reference: &str, value: &str) -> Result<(), AppError> {
        self.values
            .lock()
            .map_err(|_| AppError::SecretStore("Secret store lock failed".into()))?
            .insert(reference.into(), value.into());
        Ok(())
    }

    fn delete(&self, reference: &str) -> Result<(), AppError> {
        self.values
            .lock()
            .map_err(|_| AppError::SecretStore("Secret store lock failed".into()))?
            .remove(reference);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_secret_has_stable_error_code() {
        let store = MemorySecretStore::default();
        assert_eq!(store.get("missing").unwrap_err().code(), "SECRET_STORE");
        store.set("key", "value").unwrap();
        assert_eq!(store.get("key").unwrap(), "value");
        store.delete("key").unwrap();
        assert!(store.get("key").is_err());
    }
}
