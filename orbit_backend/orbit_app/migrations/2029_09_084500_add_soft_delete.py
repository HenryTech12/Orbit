from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orbitbackend', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='deleted_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
