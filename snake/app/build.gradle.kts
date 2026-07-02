plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "eu.carbonstealth.snake"
    compileSdk = 35

    defaultConfig {
        applicationId = "eu.carbonstealth.snake"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // По подразбиране vector drawable-ите не се разгъват до PNG.
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            // R8 свива и обфускира; shrinkResources маха неизползвани ресурси.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        // Няма Compose, няма ViewBinding — чист Canvas рендер.
        buildConfig = false
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
        }
    }
}

dependencies {
    // Минимален набор: само това, което трябва за Activity + жестове.
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")

    // JVM unit тестове за GameEngine (чист Kotlin, без Android).
    testImplementation("junit:junit:4.13.2")
}
