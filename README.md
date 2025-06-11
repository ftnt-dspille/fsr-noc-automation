# Project for TEC documents

## For Authors

1. run `hugo server` and open the url to view changes in real time. (It starts with a detailed document.)
1. Edit `config.toml`
1. Create markdown files in `content` folder
1. Publish

## For Admins

1. Use the [create-tec-project](https://svl-devops-gitlab01.fortilab.fortinet.com/tec/create-tec-project) to create a new project.

## Technical details

### Build hugo-builder docker image with CI/CD

```mermaid
flowchart TD

hugo-builder --> publish(Publish)

publish --> template[Update tec-builder-template repo]
publish --> hugo-image["Build a docker image that has:
  - the latest hugo
  - and all our customizations
  - ssh keys for rsync"]
hugo-image --> push[Push to Harbor]
```

### Build individual TEC project with CI/CD

```mermaid
flowchart TD
project[Individual TEC project] --> Publish --> shared-ci[tec-project-shared-ci]
hugo-image[The hugo-builder image from Harbor] --> container[hugo-builder container]
shared-ci --> copy[Copy and patch config.toml and content]
copy --> container
container --> hugo[Run `hugo` to build static html]
hugo --> delete[Delete shared images, js, and fonts]
delete --> rsync --> web[Project folder in Web server]
```

### Serving TEC documents to end users

```mermaid
flowchart TD
user[End users] <--> go-tec
go-tec[go-tec proxy server authenticate, authorize, and analytics] <--> html[Static html of all projects]
```
