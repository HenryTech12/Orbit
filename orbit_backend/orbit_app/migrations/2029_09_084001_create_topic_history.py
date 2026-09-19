import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orbitbackend', '2029_09_19_083012_create_topic_table'),
    ]

    operations = [
        migrations.CreateModel(
            name='TopicHistory',
            fields=[
                ('topic_history_id', models.BigAutoField(primary_key=True, serialize=False)),
                ('timestamp', models.DateTimeField(default=django.utils.timezone.now)),
                ('value_snapshot', models.TextField()),
                ('chunk', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='topic_history', to='orbitbackend.chunk')),
                ('topic', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='history', to='orbitbackend.topic')),
            ],
            options={
                'db_table': 'topic_history',
            },
        ),
    ]
