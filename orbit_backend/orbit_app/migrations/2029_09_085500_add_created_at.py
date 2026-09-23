import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orbitbackend', '2029_09_085000_create_action_items'),
    ]

    operations = [
        migrations.AddField(
            model_name=model_name,
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        )
        for model_name in ('chunk', 'classification', 'actionitem')
    ]
