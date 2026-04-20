from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("churn-model").getOrCreate()

def build_features():
    users = spark.sql("SELECT id, email, created_at FROM users")
    events = spark.read.table("events")
    orders = spark.sql("SELECT user_id, SUM(amount) as ltv FROM orders GROUP BY user_id")

    features = users.join(events, "id").join(orders, users.id == orders.user_id)
    return features
