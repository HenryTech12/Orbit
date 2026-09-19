import django.contrib.postgres.fields
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orbitbackend', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Chunk',
            fields=[
                ('chunk_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('text', models.TextField()),
                ('embedding', django.contrib.postgres.fields.ArrayField(base_field=models.FloatField(), blank=True, null=True, size=None)),
                ('token_start', models.PositiveIntegerField()),
                ('token_end', models.PositiveIntegerField()),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chunks', to='orbitbackend.message')),
            ],
            options={
                'db_table': 'chunks',
            },
        ),
    ]
