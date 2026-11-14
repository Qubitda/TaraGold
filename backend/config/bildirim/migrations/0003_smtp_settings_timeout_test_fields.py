# Generated manually for SmtpSettings / EmailConfiguration expansion

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("bildirim", "0002_seed_email_templates_rules"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="smtpsettings",
            options={
                "permissions": [("manage_smtp", "SMTP ayarlarını yönetebilir")],
                "verbose_name": "E-posta (SMTP) yapılandırması",
                "verbose_name_plural": "E-posta (SMTP) yapılandırmaları",
            },
        ),
        migrations.AddField(
            model_name="smtpsettings",
            name="last_test_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="smtpsettings",
            name="last_test_message",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="smtpsettings",
            name="last_test_success",
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="smtpsettings",
            name="timeout",
            field=models.PositiveSmallIntegerField(
                default=15,
                help_text="SMTP bağlantı zaman aşımı (saniye).",
            ),
        ),
        migrations.AddField(
            model_name="smtpsettings",
            name="updated_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddConstraint(
            model_name="smtpsettings",
            constraint=models.CheckConstraint(
                condition=models.Q(("timeout__gte", 1), ("timeout__lte", 120)),
                name="smtp_timeout_gecerli",
            ),
        ),
    ]
