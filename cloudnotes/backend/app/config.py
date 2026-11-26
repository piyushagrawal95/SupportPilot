from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")
    supabase_url: str
    supabase_anon_key: str
    frontend_url: str = "http://localhost:5173"
    database_url: str
    stripe_secret_key: str
    stripe_price_id: str
    supportpilot_url: str = "http://localhost:8001"
    supportpilot_key: str = ""
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"

settings = Settings()
