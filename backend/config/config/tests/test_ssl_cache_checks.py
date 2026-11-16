"""taragold.E003 / E004 — SSL proxy + DatabaseCache tablo checks."""

from __future__ import annotations

from unittest.mock import patch

from django.core.checks import Error
from django.test import SimpleTestCase, override_settings

from config.checks import check_database_cache_table, check_ssl_redirect_proxy_header


class SslProxyCheckTests(SimpleTestCase):
    @override_settings(SECURE_SSL_REDIRECT=True, SECURE_PROXY_SSL_HEADER=None)
    @patch("config.checks._running_tests", return_value=False)
    def test_ssl_without_proxy_is_error(self, _mock):
        errs = check_ssl_redirect_proxy_header(None)
        self.assertEqual(len(errs), 1)
        self.assertEqual(errs[0].id, "taragold.E003")

    @override_settings(
        SECURE_SSL_REDIRECT=True,
        SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
    )
    @patch("config.checks._running_tests", return_value=False)
    def test_ssl_with_proxy_ok(self, _mock):
        self.assertEqual(check_ssl_redirect_proxy_header(None), [])


class DatabaseCacheTableCheckTests(SimpleTestCase):
    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.db.DatabaseCache",
                "LOCATION": "missing_cache_table_xyz",
            }
        }
    )
    @patch("config.checks._running_tests", return_value=False)
    @patch("django.db.connection.introspection.table_names", return_value=["django_session"])
    def test_missing_table_error(self, _tables, _mock):
        errs = check_database_cache_table(None)
        self.assertTrue(any(isinstance(e, Error) and e.id == "taragold.E004" for e in errs))

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.db.DatabaseCache",
                "LOCATION": "taragold_cache",
            }
        }
    )
    @patch("config.checks._running_tests", return_value=False)
    @patch(
        "django.db.connection.introspection.table_names",
        return_value=["taragold_cache", "django_session"],
    )
    def test_table_present_ok(self, _tables, _mock):
        self.assertEqual(check_database_cache_table(None), [])
