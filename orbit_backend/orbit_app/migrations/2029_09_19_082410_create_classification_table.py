import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orbitbackend', '2029_09_19_082100_create_table_chunks'),
    ]

    operations = [
        migrations.CreateModel(
            name='Classification',
            fields=[
                ('classification_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('category', models.CharField(choices=[('announcement', 'Announcement'), ('general', 'General')], max_length=16)),
                ('topic_label', models.CharField(max_length=255)),
                ('item_type', models.CharField(choices=[('question', 'Question'), ('decision', 'Decision'), ('action_item', 'Action Item')], max_length=16)),
                ('chunk', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='classifications', to='orbitbackend.chunk')),
            ],
            options={
                'db_table': 'classifications',
            },
        ),
    ]
