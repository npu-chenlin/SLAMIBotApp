plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// 读取根目录版本号文件
val versionLines = file("../../version.properties").readLines()
val versionName = versionLines.find { it.startsWith("VERSION_NAME=") }?.substringAfter("=") ?: "1.0.0"
val versionCode = versionLines.find { it.startsWith("VERSION_CODE=") }?.substringAfter("=")?.toInt() ?: 1

android {
    namespace = "com.example.metacam"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.example.metacam"
        minSdk = 29
        targetSdk = 35
        this.versionCode = versionCode
        this.versionName = versionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "/Users/lin/slamibot_app.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "slamibot123"
            keyAlias = System.getenv("KEY_ALIAS") ?: "slamibot_app"
            keyPassword = System.getenv("KEY_PASSWORD") ?: "slamibot123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    kotlinOptions {
        jvmTarget = "11"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    // WebView Asset Loader
    implementation("androidx.webkit:webkit:1.8.0")
    implementation("com.squareup.okhttp3:okhttp:4.9.3")
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)
}
