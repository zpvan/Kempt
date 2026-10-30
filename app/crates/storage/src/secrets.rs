use kempt_core::{
    branding::BUNDLE_ID,
    error::AppError,
    secrets::SecretStore,
};

pub struct KeyringSecretStore {
    service: String,
}

impl Default for KeyringSecretStore {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyringSecretStore {
    pub fn new() -> Self {
        Self {
            service: BUNDLE_ID.into(),
        }
    }

    fn entry(&self, reference: &str) -> Result<keyring::Entry, AppError> {
        keyring::Entry::new(&self.service, reference)
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }
}

impl SecretStore for KeyringSecretStore {
    fn get(&self, reference: &str) -> Result<String, AppError> {
        self.entry(reference)?
            .get_password()
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }

    fn set(&self, reference: &str, value: &str) -> Result<(), AppError> {
        self.entry(reference)?
            .set_password(value)
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }

    fn delete(&self, reference: &str) -> Result<(), AppError> {
        self.entry(reference)?
            .delete_credential()
            .map_err(|e| AppError::SecretStore(e.to_string()))
    }
}
