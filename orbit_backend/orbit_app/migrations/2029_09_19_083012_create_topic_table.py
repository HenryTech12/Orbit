from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orbitbackend', '2029_09_19_082410_create_classification_table'),
    ]

    operations = [
        migrations.CreateModel(
            name='Topic',
            fields=[
                ('topic_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('label', models.CharField(max_length=255)),
                ('latest_status', models.CharField(choices=[('confirmed', 'Confirmed'), ('disputed', 'Disputed'), ('stale', 'Stale'), ('unknown', 'Unknown')], default='unknown', max_length=16)),
                ('last_updated', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'topics',
            },
        ),
    ]
