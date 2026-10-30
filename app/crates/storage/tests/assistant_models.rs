mod common;

use common::assistant::*;
use kempt_core::secrets::SecretStore;

#[tokio::test]
async fn model_listing_never_contains_api_key() {
    let fixture = AssistantFixture::new();
    fixture.service.save_model(sample_model(), Some("secret-value".into())).await.unwrap();
    let json = serde_json::to_string(&fixture.service.list_models().unwrap()).unwrap();
    assert!(!json.contains("secret-value"));
    assert!(!json.contains("apiKey"));
    assert_eq!(fixture.secrets.get("assistant-model/invalid").unwrap_err().code(), "SECRET_STORE");
}

#[tokio::test]
async fn default_model_switch_and_delete_are_consistent() {
    let fixture = AssistantFixture::new();
    let first = fixture.service.save_model(sample_model(), Some("first-secret".into())).await.unwrap();
    let mut second_draft = sample_model();
    second_draft.name = "Second".into();
    let second = fixture.service.save_model(second_draft, Some("second-secret".into())).await.unwrap();
    assert_eq!(second.len(), 2);
    assert_eq!(second.iter().filter(|model| model.is_default).count(), 1);
    let second_id = second.iter().find(|model| model.name == "Second").unwrap().id.clone();
    fixture.service.set_default_model(&second_id).unwrap();
    assert!(fixture.service.list_models().unwrap()[0].is_default);
    fixture.service.delete_model(&second_id).unwrap();
    let remaining = fixture.service.list_models().unwrap();
    assert_eq!(remaining.len(), 1);
    assert!(remaining[0].is_default);
    assert_eq!(first.len(), 1);
}
