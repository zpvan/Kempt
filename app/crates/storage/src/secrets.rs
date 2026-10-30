use kempt_core::{error::AppError, secrets::SecretStore};

pub struct KeyringSecretStore;

impl SecretStore for KeyringSecretStore {
    fn get(&self, reference: &str) -> Result<String, AppError> {
        let entry = keyring::Entry::new("com.kempt.workflow", reference)
            .map_err(|e| AppError::SecretStore(e.to_string()))?;
        entry
            .get_password()
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }

    fn set(&self, reference: &str, value: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new("com.kempt.workflow", reference)
            .map_err(|e| AppError::SecretStore(e.to_string()))?;
        entry
            .set_password(value)
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }

    fn delete(&self, reference: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new("com.kempt.workflow", reference)
            .map_err(|e| AppError::SecretStore(e.to_string()))?;
        entry
            .delete_credential()
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }
}
