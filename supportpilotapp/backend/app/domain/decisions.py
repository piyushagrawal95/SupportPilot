from dataclasses import dataclass
from enum import Enum  #Enumeration (helps us manage predefined values)

class Outcome(str,Enum):
    ALLOW="allow"
    NEEDS_APPROVAL="needs_approval"
    BLOCK="block"
    HUMAN_ONLY="human_only"

@dataclass(frozen=True)
class Decision:
    outcome:Outcome
    rule:str        #kaunsa rule lagega, jaise "REFUND_WINDOW_7_DAYS"
    reason:str      #reason, customer ya staff ko dikhane ke liye