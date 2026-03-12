import type { PackageType } from "./types";

export function getInstallCommand(
  packageType: PackageType,
  packageName: string,
  version: string,
  gitlabUrl: string,
  projectPath?: string,
): string {
  const registryUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(projectPath || "")}/packages`;

  switch (packageType) {
    case "npm":
      return `npm install ${packageName}@${version}`;
    case "maven":
      return `<dependency>\n  <groupId>${packageName.split("/")[0] || packageName}</groupId>\n  <artifactId>${packageName.split("/")[1] || packageName}</artifactId>\n  <version>${version}</version>\n</dependency>`;
    case "pypi":
      return `pip install ${packageName}==${version}`;
    case "nuget":
      return `dotnet add package ${packageName} --version ${version}`;
    case "golang":
      return `go get ${packageName}@v${version}`;
    case "composer":
      return `composer require ${packageName}:${version}`;
    case "conan":
      return `conan install ${packageName}/${version}@`;
    case "helm":
      return `helm install ${packageName} --version ${version}`;
    case "generic":
      return `curl --header "PRIVATE-TOKEN: <token>" "${registryUrl}/generic/${packageName}/${version}/<file_name>"`;
    case "docker":
      return `docker pull ${gitlabUrl.replace(/^https?:\/\//, "")}/${projectPath || "<project>"}/${packageName}:${version}`;
    default:
      return `# ${packageType}: ${packageName}@${version}`;
  }
}

export function getPackageTypeColor(type: PackageType): string {
  const colors: Record<PackageType, string> = {
    npm: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    maven: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    pypi: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    docker: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
    nuget: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    golang: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
    composer: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    conan: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    helm: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
    generic: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  };
  return colors[type] || colors.generic;
}
