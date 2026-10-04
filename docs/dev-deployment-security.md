# Development Deployment Security

This deployment targets a Raspberry Pi on a home network. It is development infrastructure, not production.

## Trust boundary

- Pull requests run validation, security checks, and builds only on GitHub-hosted runners.
- The Pi runner is used only by `.github/workflows/deploy-dev.yml`.
- Deployment is `workflow_dispatch`-only and protected by the GitHub `development` environment.
- `build-images.yml` builds immutable commit-SHA tags on GitHub-hosted runners but does not invoke deployment.
- The Pi pulls those prebuilt images; it does not run `docker build`, install dependencies, or execute PR scripts.

The deployment checks that `image_tag` is a 40-character commit SHA before checking out the matching trusted repository commit. A missing image or failed migration fails the deployment and leaves the last-known-good tag unchanged; the existing rollback path restores that tag.

## Pi configuration

The deployment reads secrets from `~/.config/schedular/.env.deploy`. Keep the directory and file private:

```text
~/.config/schedular             700
~/.config/schedular/.env.deploy 600
```

The file is never committed. The Pi should have Docker access only for the deployment account, and the Docker API should not be exposed over TCP.

## Network exposure

- The application remains available on LAN port `8080` for development-device testing.
- Mailpit's UI is bound to Pi localhost on port `8025`.
- PostgreSQL has no host-published port in the deployment Compose file.
- Services communicate over the private Compose network.

## Manual operation

1. On GitHub, run `build-images` from the trusted `develop` branch and wait for the image push to succeed.
2. Copy the resulting 40-character commit SHA.
3. Run `deploy-dev`, enter that SHA, and approve the `development` environment if prompted.
4. Confirm the deployment and rollback readiness checks pass.

To test rollback, use the existing migration-failure simulation in the deployment process with a deliberately failing trusted candidate, then verify that the previous last-known-good image becomes healthy and the state file is unchanged.