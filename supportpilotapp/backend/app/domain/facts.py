from dataclasses import dataclass
from datetime import datetime

@dataclass(frozen=True)
class ChargeFacts:
    """Ek payment ke baare m,Stripe se nikalta hua data"""
    charge_id:str
    amount_cents:int        #original charge
    refunded_cents:int      #ab tak is charge pe kitna refund ho chuka
    created_at:datetime     #payment kab hui (timezone ke saath)
    period_start:datetime | None=None #ye payment kis billing period ki thi
    period_end:datetime | None=None

@dataclass(frozen=True)
class CustomerHistory:
    """Is customer ke apne records (humare DB se)"""
    auto_refund_in_last_30_days:bool  #kya 30 din m AI ne khud refund kia h

@dataclass(frozen=True)
class Limits:
    """Settings table ka snapshot + aaj ka hisaab"""
    auto_refund_limit_cents:int         #$50=5000
    daily_cap_cents:int                 #$500=50000
    auto_refunded_today_cents:int         #aaj AI ne kitna refund kia
    ai_enabled:bool                     #kill switch
    watching_mode:bool                  #True=AI sirf suggest kre
    auto_mode_for_case:bool             #is case type ke liye auto mode on hai??