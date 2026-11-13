# Spotify App Remote 0.8.0 references Jackson serializers and an internal
# @NotNull annotation that are not packaged in the AAR. Runtime uses Gson.
-dontwarn com.fasterxml.jackson.**
-dontwarn com.spotify.base.annotations.**
-keep class com.spotify.** { *; }
