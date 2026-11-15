namespace Nexora.AppHost;

// Reviewed repository digests from the exact images used by the local stack.
// Mailpit v1.33.1 was reviewed on 2026-11-12; the other digests come from the local P1 stack on 2026-11-06.
// Updating a tag requires reviewing and updating its digest together.
internal static class ContainerImageDigests
{
    public const string Postgres = "7e32e9833a6fb1c92c32552794cb6ed569d51b445a54907d35fc112ef39684db";
    public const string Rabbit = "6e51f8f18e055d6dc3d94316db0073da64d811c2e19744661fae06b03c1d6fa8";
    public const string Redis = "372207266325710e75866163a505d18ac0362372c8bf02ad5a0cf0b3c8bbc23e";
    public const string Keycloak = "3879c623248408de29a5303178b5816c77e8dfef3890c361f8c0bbeaa979ba3b";
    public const string Mailpit = "aef2aacc11f075ec0fb6874275ee4a421e688e11a96ebb296134d1735c7761ce";
}
