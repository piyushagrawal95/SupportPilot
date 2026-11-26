from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")
    database_url: str
    stripe_secret_key: str
    stripe_webhook_secret: str
    internal_api_key: str
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b"
    email_provider: str = "log"
    email_from: str = ""
    email_from_name: str = "CloudNotes Support"
    maileroo_api_key: str = ""
    maileroo_base_url: str = "https://smtp.maileroo.com/api/v2"
    jwt_secret: str
    frontend_url: str = "http://localhost:5174"
    cloudnotes_frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:3000"

settings = Settings()
