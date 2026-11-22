import unittest

from billing.invoice import calculate_total


class CalculateTotalTest(unittest.TestCase):
    def test_no_discounts(self):
        order = {"items": [{"price": 50.0, "qty": 2}]}
        self.assertEqual(calculate_total(order, {}), 100.0)

    def test_coupon_only(self):
        order = {"items": [{"price": 100.0, "qty": 1}], "coupon": "SAVE10"}
        self.assertEqual(calculate_total(order, {}), 90.0)

    def test_loyalty_only(self):
        order = {"items": [{"price": 100.0, "qty": 1}]}
        self.assertEqual(calculate_total(order, {"loyalty_tier": "gold"}), 90.0)


if __name__ == "__main__":
    unittest.main()
