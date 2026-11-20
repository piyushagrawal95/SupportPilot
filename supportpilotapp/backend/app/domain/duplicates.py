from datetime import timedelta

from app.domain.facts import ChargeFacts
from app.domain.policy import refundable_cents

#Itne time ke andar same amount ke charges duplicate maane jaate hai
DUPLICATE_GAP=timedelta(minutes=10)

def find_duplicates(charges:list[ChargeFacts],gap:timedelta=DUPLICATE_GAP) -> list[ChargeFacts]:
    """Ek customer ke succeeded charges me se wo nikalta hai jo duplicate hai.
    Rule: same amount aur pehle charge ko 10 min ke andar.Pehla charge original hai baaki duplicate hai. Jo duplicate pehle hi poora refund ho chuka hai,
    use list se hata dete hai"""
    duplicates:list[ChargeFacts]=[]
    by_amount:dict[int,list[ChargeFacts]]={}
    for c in charges:
        by_amount.setdefault(c.amount_cents,[]).append(c)

    for same_amount in by_amount.values():
        same_amount.sort(key=lambda c:c.created_at)
        original=None
        for c in same_amount:
            if original is None or c.created_at - original.created_at > gap:
                original =c # naya cluster shuru, ye uska original hai
            else:
                duplicates.append(c)


    #jo pehle hi poora refund ho chuka hai, use dobara refund nhi krna  
    duplicates=[c for c in duplicates if refundable_cents(c)>0]
    return sorted(duplicates,key=lambda c:c.created_at)