# Правила за R8/ProGuard за „Змия“.
# Играта няма рефлексия, сериализация или JNI, затова базовите правила стигат.
# Пазим имената на Activity-тата (референцирани от манифеста ги пази автоматично).

# Kotlin metadata за по-добри stack trace-ове при крашове.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
