import sys
from datetime import datetime,timezone

import stripe
from app.core.config import settings

stripe.api_key=settings.stripe_secret_key

