// Publish commands per format. Safe for client and server components.
// Tokens are always placeholders; CI snippets use the job token, so no secret is needed.

import { projectRegistryUrl, type InstallContext, type Snippet } from "@/lib/gitlab/install-commands";

const TOKEN = "<your_token>";

function host(url: string) {
  return url.replace(/^https?:\/\//, "");
}

/** Manual (CLI) publish commands against a specific project. */
export function getCliPublishSnippets(format: string, ctx: InstallContext): Snippet[] {
  const url = projectRegistryUrl(ctx, format);
  switch (format) {
    case "npm":
      return [
        {
          label: "npm publish",
          language: "bash",
          code: `npm config set "//${host(url)}/:_authToken" "${TOKEN}"\nnpm publish --registry "${url}/"`,
        },
      ];
    case "maven":
      return [
        {
          label: "pom.xml",
          language: "xml",
          code: `<distributionManagement>\n  <repository>\n    <id>gitlab-maven</id>\n    <url>${url}</url>\n  </repository>\n  <snapshotRepository>\n    <id>gitlab-maven</id>\n    <url>${url}</url>\n  </snapshotRepository>\n</distributionManagement>`,
        },
        { label: "mvn deploy", language: "bash", code: "mvn deploy" },
        { label: "Gradle", language: "bash", code: "./gradlew publish" },
      ];
    case "pypi":
      return [
        {
          label: "twine",
          language: "bash",
          code: `python -m build\nTWINE_USERNAME=__token__ TWINE_PASSWORD=${TOKEN} \\\n  python -m twine upload --repository-url ${url} dist/*`,
        },
      ];
    case "nuget":
      return [
        {
          label: "dotnet",
          language: "bash",
          code: `dotnet pack -c Release\ndotnet nuget push "bin/Release/*.nupkg" --source gitlab`,
        },
      ];
    case "composer":
      return [
        {
          label: "From a tag",
          language: "bash",
          code: `curl --fail-with-body --header "PRIVATE-TOKEN: ${TOKEN}" \\\n  --data tag=v1.0.0 \\\n  "${url}"`,
        },
      ];
    case "conan":
      return [
        {
          label: "conan upload",
          language: "bash",
          code: `conan create . --user <user> --channel <channel>\nconan upload "<name>/<version>@<user>/<channel>" -r gitlab --confirm`,
        },
      ];
    case "golang":
      return [
        {
          label: "Tag a release",
          language: "bash",
          code: `# GitLab serves Go modules straight from the repository's semver tags.\ngit tag v1.0.0\ngit push origin v1.0.0`,
        },
      ];
    case "rubygems":
      return [
        {
          label: "gem push",
          language: "bash",
          code: `gem build *.gemspec\ngem push *.gem --host ${url}`,
        },
      ];
    case "terraform_module":
      return [
        {
          label: "Upload module",
          language: "bash",
          code: `tar -czf module.tgz -C ./module .\ncurl --fail-with-body --header "PRIVATE-TOKEN: ${TOKEN}" \\\n  --upload-file module.tgz \\\n  "${ctx.gitlabUrl}/api/v4/projects/${ctx.projectId}/packages/terraform/modules/<name>/<system>/<version>/file"`,
        },
      ];
    default:
      return [];
  }
}

/** Formats offered on the "Publish from CI" tab, in display order. */
export const CI_FORMATS = [
  "npm",
  "maven",
  "pypi",
  "nuget",
  "generic",
  "helm",
  "composer",
  "conan",
  "golang",
  "rubygems",
  "terraform_module",
  "container",
] as const;
export type CiFormat = (typeof CI_FORMATS)[number];

const RULES = `  stage: deploy\n  rules:\n    - if: $CI_COMMIT_TAG`;
const PROJECT_REGISTRY = "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages";

/** `.gitlab-ci.yml` jobs that publish on every tag with CI_JOB_TOKEN. */
export function getCiPublishSnippets(format: CiFormat): Snippet[] {
  switch (format) {
    case "npm":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:npm:\n  image: node:22\n${RULES}\n  script:\n    - npm config set "\${CI_API_V4_URL#http*:}/projects/\${CI_PROJECT_ID}/packages/npm/:_authToken" "\${CI_JOB_TOKEN}"\n    - npm publish --registry "${PROJECT_REGISTRY}/npm/"`,
        },
      ];
    case "maven":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:maven:\n  image: maven:3-eclipse-temurin-21\n${RULES}\n  script:\n    - mvn deploy -s ci_settings.xml`,
        },
        {
          label: "ci_settings.xml",
          language: "xml",
          code: `<settings xmlns="http://maven.apache.org/SETTINGS/1.1.0">\n  <servers>\n    <server>\n      <id>gitlab-maven</id>\n      <configuration>\n        <httpHeaders>\n          <property>\n            <name>Job-Token</name>\n            <value>\${CI_JOB_TOKEN}</value>\n          </property>\n        </httpHeaders>\n      </configuration>\n    </server>\n  </servers>\n</settings>`,
        },
        {
          label: "pom.xml",
          language: "xml",
          code: `<distributionManagement>\n  <repository>\n    <id>gitlab-maven</id>\n    <url>\${CI_API_V4_URL}/projects/\${CI_PROJECT_ID}/packages/maven</url>\n  </repository>\n</distributionManagement>`,
        },
      ];
    case "pypi":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:pypi:\n  image: python:3.12\n${RULES}\n  script:\n    - pip install build twine\n    - python -m build\n    - TWINE_USERNAME=gitlab-ci-token TWINE_PASSWORD=\${CI_JOB_TOKEN} python -m twine upload --repository-url ${PROJECT_REGISTRY}/pypi dist/*`,
        },
      ];
    case "nuget":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:nuget:\n  image: mcr.microsoft.com/dotnet/sdk:8.0\n${RULES}\n  script:\n    - dotnet pack -c Release\n    - dotnet nuget add source "${PROJECT_REGISTRY}/nuget/index.json" --name gitlab --username gitlab-ci-token --password \${CI_JOB_TOKEN} --store-password-in-clear-text\n    - dotnet nuget push "bin/Release/*.nupkg" --source gitlab`,
        },
      ];
    case "generic":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:generic:\n  image: curlimages/curl:latest\n${RULES}\n  script:\n    - 'curl --fail-with-body --header "JOB-TOKEN: \${CI_JOB_TOKEN}" --upload-file dist/app.tar.gz "${PROJECT_REGISTRY}/generic/my-package/\${CI_COMMIT_TAG}/app.tar.gz"'`,
        },
      ];
    case "helm":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:helm:\n  image: alpine/helm:3.16.4\n${RULES}\n  script:\n    - apk add --no-cache curl\n    - helm package ./chart --destination dist\n    - 'for f in dist/*.tgz; do curl --fail-with-body --request POST --user gitlab-ci-token:\${CI_JOB_TOKEN} --form "chart=@\${f}" "${PROJECT_REGISTRY}/helm/api/stable/charts"; done'`,
        },
      ];
    case "composer":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:composer:\n  image: curlimages/curl:latest\n${RULES}\n  script:\n    - 'curl --fail-with-body --header "Job-Token: \${CI_JOB_TOKEN}" --data tag=\${CI_COMMIT_TAG} "${PROJECT_REGISTRY}/composer"'`,
        },
      ];
    case "conan":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:conan:\n  image: conanio/gcc11\n${RULES}\n  script:\n    - conan remote add gitlab ${PROJECT_REGISTRY}/conan\n    - conan create . --user ci --channel stable\n    - CONAN_LOGIN_USERNAME=ci_user CONAN_PASSWORD=\${CI_JOB_TOKEN} conan upload "*" -r gitlab --confirm`,
        },
      ];
    case "golang":
      return [
        {
          label: "Release",
          language: "bash",
          code: `# No job needed: GitLab serves Go modules from the repository's semver tags.\ngit tag v1.0.0\ngit push origin v1.0.0`,
        },
      ];
    case "rubygems":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:rubygems:\n  image: ruby:3.3\n${RULES}\n  variables:\n    GEM_HOST_API_KEY: \${CI_JOB_TOKEN}\n  script:\n    - gem build *.gemspec\n    - gem push *.gem --host ${PROJECT_REGISTRY}/rubygems`,
        },
      ];
    case "terraform_module":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:terraform:\n  image: curlimages/curl:latest\n${RULES}\n  variables:\n    MODULE_NAME: my-module\n    MODULE_SYSTEM: aws\n  script:\n    - tar -czf /tmp/module.tgz -C ./module .\n    - 'curl --fail-with-body --header "JOB-TOKEN: \${CI_JOB_TOKEN}" --upload-file /tmp/module.tgz "${PROJECT_REGISTRY}/terraform/modules/\${MODULE_NAME}/\${MODULE_SYSTEM}/\${CI_COMMIT_TAG#v}/file"'`,
        },
      ];
    case "container":
      return [
        {
          label: ".gitlab-ci.yml",
          language: "text",
          code: `publish:image:\n  image: docker:27\n  services:\n    - docker:27-dind\n${RULES}\n  script:\n    - echo "\${CI_REGISTRY_PASSWORD}" | docker login -u "\${CI_REGISTRY_USER}" --password-stdin "\${CI_REGISTRY}"\n    - docker build -t "\${CI_REGISTRY_IMAGE}:\${CI_COMMIT_TAG}" .\n    - docker push "\${CI_REGISTRY_IMAGE}:\${CI_COMMIT_TAG}"`,
        },
      ];
  }
}
