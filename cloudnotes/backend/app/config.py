from pydantic_settings import BaseSettings,SettingsConfigDict

class Settings(BaseSettings):
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
    supabase_url:str
    supabase_anon_key:str
    frontend_url:str="http://localhost:5173"
    database_url:str
    stripe_secret_key:str
    stripe_price_id:str
    supportpilot_url:str="http://localhost:8001"
    supportpilot_key:str=""

settings=Settings()