COUPONS = {"SAVE10": 0.10, "WELCOME5": 0.05}
LOYALTY_RATES = {"silver": 0.05, "gold": 0.10}


def calculate_total(order, customer):
    subtotal = sum(item["price"] * item["qty"] for item in order["items"])
    total = subtotal
    if order.get("items"):
        if customer is not None:
            if order.get("coupon"):
                if order["coupon"] in COUPONS:
                    total = total - subtotal * COUPONS[order["coupon"]]
                    if customer.get("loyalty_tier"):
                        if customer["loyalty_tier"] in LOYALTY_RATES:
                            total = total - subtotal * LOYALTY_RATES[customer["loyalty_tier"]]
                            if order.get("coupon"):
                                total = total - subtotal * COUPONS[order["coupon"]]
            else:
                if customer.get("loyalty_tier"):
                    if customer["loyalty_tier"] in LOYALTY_RATES:
                        total = total - subtotal * LOYALTY_RATES[customer["loyalty_tier"]]
    return round(total, 2)
