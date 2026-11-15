"""taragold.E002 / W002 — fake provider system checks (DEBUG=False)."""

from __future__ import annotations

from unittest.mock import patch

from django.core.checks import Error, Warning
from django.test import SimpleTestCase, override_settings

from config.checks import check_fake_providers_in_prod


class FakeProviderCheckTests(SimpleTestCase):
    @override_settings(
        DEBUG=False,
        PAYMENT_PROVIDER="fake",
        CARRIER_PROVIDER="fake",
        ALLOW_FAKE_PROVIDERS=False,
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_prod_fake_without_allow_is_error(self, _mock):
        errors = check_fake_providers_in_prod(None)
        self.assertEqual(len(errors), 1)
        self.assertIsInstance(errors[0], Error)
        self.assertEqual(errors[0].id, "taragold.E002")

    @override_settings(
        DEBUG=False,
        PAYMENT_PROVIDER="fake",
        CARRIER_PROVIDER="fake",
        ALLOW_FAKE_PROVIDERS=True,
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_prod_fake_with_allow_is_warning(self, _mock):
        msgs = check_fake_providers_in_prod(None)
        self.assertEqual(len(msgs), 1)
        self.assertIsInstance(msgs[0], Warning)
        self.assertEqual(msgs[0].id, "taragold.W002")

    @override_settings(
        DEBUG=True,
        PAYMENT_PROVIDER="fake",
        CARRIER_PROVIDER="fake",
        ALLOW_FAKE_PROVIDERS=False,
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_debug_skips_fake_check(self, _mock):
        self.assertEqual(check_fake_providers_in_prod(None), [])
