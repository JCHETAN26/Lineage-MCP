"""PySpark training job — exactly the kind of script that silently filled
the training set with nulls in the founding story."""
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("ml-training").getOrCreate()

users_df = spark.sql("SELECT id, email, name FROM users")
users_df.createOrReplaceTempView("users_view")

features = spark.sql("SELECT id, email AS contact FROM users_view WHERE email IS NOT NULL")
features.write.parquet("/tmp/features.parquet")
