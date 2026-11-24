from pydantic_settings import BaseSettings,SettingsConfigDict

class Settings(BaseSettings):
    model_config=SettingsConfigDict(env_file=".env", extra="ignore")
    database_url:str
    stripe_secret_key:str
    stripe_webhook_secret:str
    internal_api_key:str
    llm_base_url:str="https://api.groq.com/openai/v1"
    llm_api_key:str=""
    llm_model:str="openai/gpt-oss-120b"
    email_provider:str="log"
    email_from:str=""
    email_from_name:str="Cloudnotes support"
    maileroo_api_key:str=""
    maileroo_base_url:str="https://smtp.maileroo.com/api/v2"

settings=Settings()