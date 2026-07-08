import xml.etree.ElementTree as ET
import argparse
from datetime import datetime
import subprocess
import os
import json


def get_repo_root():
    """Return the git repository root."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.STDOUT
        ).decode("utf-8").strip()
    except subprocess.CalledProcessError as e:
        print("Error determining git repo root:", e.output.decode())
        return None


def get_last_tag_for_version(version):
    """Return the tag name for the given version."""
    return f"v{version}"


def get_git_log_all(since_version):
    """Get all git commit subjects since the last version tag."""
    try:
        subprocess.check_call(["git", "pull"], stderr=subprocess.STDOUT)

        repo_root = get_repo_root()
        if not repo_root:
            return []

        since_version = f"v{since_version}"

        log = subprocess.check_output(
            [
                "git", "log", f"{since_version}..HEAD",
                "--pretty=format:%s"
            ],
            stderr=subprocess.STDOUT,
            cwd=repo_root
        ).decode("utf-8").strip()

        if not log:
            return []

        changes = []
        seen = set()

        for line in log.splitlines():
            msg = line.strip()
            if not msg:
                continue
            if msg.lower() == "prepare for release":
                continue
            if msg not in seen:
                seen.add(msg)
                changes.append(msg)

        return changes

    except subprocess.CalledProcessError as e:
        print("Error retrieving full git log:", e.output.decode())
        return []


def get_git_log_for_package(since_version, package_path):
    """Get git commit subjects since the last version tag, limited to the package path."""
    try:
        repo_root = get_repo_root()
        if not repo_root:
            return []

        abs_package_path = os.path.abspath(package_path)
        rel_package_path = os.path.relpath(abs_package_path, repo_root)

        since_version = f"v{since_version}"

        log = subprocess.check_output(
            [
                "git", "log", f"{since_version}..HEAD",
                "--pretty=format:%s",
                "--", rel_package_path
            ],
            stderr=subprocess.STDOUT,
            cwd=repo_root
        ).decode("utf-8").strip()

        if not log:
            return []

        changes = []
        seen = set()

        for line in log.splitlines():
            msg = line.strip()
            if not msg:
                continue
            if msg.lower() == "prepare for release":
                continue
            if msg not in seen:
                seen.add(msg)
                changes.append(msg)

        return changes

    except subprocess.CalledProcessError as e:
        print("Error retrieving package git log:", e.output.decode())
        return []

def get_git_changes_since_last_version(current_version, package_path):
    """Get commit subjects since the last version tag, limited to the given package path."""
    try:
        subprocess.check_call(["git", "pull"], stderr=subprocess.STDOUT)

        repo_root = get_repo_root()
        if not repo_root:
            return []

        abs_package_path = os.path.abspath(package_path)
        rel_package_path = os.path.relpath(abs_package_path, repo_root)
        last_tag = get_last_tag_for_version(current_version)

        log = subprocess.check_output(
            [
                "git", "log", f"{last_tag}..HEAD",
                "--pretty=format:%s",
                "--", rel_package_path
            ],
            stderr=subprocess.STDOUT,
            cwd=repo_root
        ).decode("utf-8").strip()

        if not log:
            return []

        changes = []
        seen = set()

        for line in log.splitlines():
            msg = line.strip()
            if not msg:
                continue

            lower_msg = msg.lower()
            if lower_msg == "prepare for release":
                continue

            if msg not in seen:
                seen.add(msg)
                changes.append(msg)

        return changes

    except subprocess.CalledProcessError as e:
        print("Error retrieving git log:", e.output.decode())
        return []


def update_package_json(new_version, current_version):
    """Update the version in package.json if it exists, preserving formatting."""
    package_json_path = 'package.json'
    if os.path.exists(package_json_path):
        with open(package_json_path, 'r', encoding='utf-8') as json_file:
            package_data = json.load(json_file)

        package_data['version'] = new_version

        with open(package_json_path, 'w', encoding='utf-8') as json_file:
            json.dump(package_data, json_file, indent=2, separators=(',', ': '))
            json_file.write('\n')

        print(f"Version updated in {package_json_path}.")
        return True

    elif os.getcwd().endswith('fkie_mas_daemon'):
        gui_file_path = '../fkie_mas_gui/src/renderer/context/SettingsContext.tsx'
        content = ''
        with open(gui_file_path, 'r', encoding='utf-8') as gui_file:
            content = gui_file.read()
            content = content.replace(
                f'MIN_VERSION_DAEMON = "{current_version}"',
                f'MIN_VERSION_DAEMON = "{new_version}"'
            )
        if content:
            with open(gui_file_path, 'w', encoding='utf-8') as gui_file:
                gui_file.write(content)
                print(f"MIN_VERSION_DAEMON updated in {gui_file_path}.")
    return False


def update_changelog_md(new_version, changes):
    """Update CHANGELOG.md if it exists."""
    changelog_path = 'CHANGELOG.md'
    if not os.path.exists(changelog_path):
        return

    if changes:
        bullet_list = "\n".join(f"{change}" for change in changes)
    else:
        bullet_list = "- No package-specific changes found"

    changelog_entry = (
        f"## {new_version} - {datetime.now().strftime('%d.%m.%Y')}\n\n"
        f"{bullet_list}\n\n"
    )

    with open(changelog_path, 'r', encoding='utf-8') as changelog_file:
        lines = changelog_file.readlines()

    insert_index = 2 if len(lines) >= 2 else len(lines)
    lines.insert(insert_index, changelog_entry)

    with open(changelog_path, 'w', encoding='utf-8') as changelog_file:
        changelog_file.writelines(lines)

    print(f"Entry added to {changelog_path}.")


def update_changelog_rst(new_version, changes):
    """Update CHANGELOG.rst if it exists, inserting after the package title block."""
    changelog_path = 'CHANGELOG.rst'
    if not os.path.exists(changelog_path):
        return

    title = f"{new_version} ({datetime.now().strftime('%d.%m.%Y')})"
    underline = "-" * len(title)

    if changes:
        bullet_list = "\n".join(f"* {change}" for change in changes)
    else:
        bullet_list = "* No package-specific changes found"

    changelog_entry = f"{title}\n{underline}\n{bullet_list}\n\n"

    with open(changelog_path, 'r', encoding='utf-8') as changelog_file:
        lines = changelog_file.readlines()

    insert_index = 0

    # Standard ROS changelog.rst header:
    # 0: ^^^^^^^^^^^^^
    # 1: Changelog for package ...
    # 2: ^^^^^^^^^^^^^
    # 3: empty line
    if len(lines) >= 4 and lines[3].strip() == "":
        insert_index = 4
    else:
        # fallback: insert after first empty line
        for i, line in enumerate(lines):
            if line.strip() == "":
                insert_index = i + 1
                break

    lines.insert(insert_index, changelog_entry)

    with open(changelog_path, 'w', encoding='utf-8') as changelog_file:
        changelog_file.writelines(lines)

    print(f"Entry added to {changelog_path}.")


def bump_version(package_path, version_part):
    """Increase the version in package.xml and update changelog files."""
    original_cwd = os.getcwd()
    abs_package_path = os.path.abspath(package_path)
    os.chdir(abs_package_path)

    try:
        tree = ET.parse('package.xml')
        root = tree.getroot()

        version_tag = root.find('version')
        if version_tag is None:
            print("No <version> tag found.")
            return

        current_version = version_tag.text
        print(f"Current version: {current_version}")

        try:
            major, minor, patch = map(int, current_version.split('.'))

            if version_part == 'major':
                major += 1
                minor = 0
                patch = 0
            elif version_part == 'minor':
                minor += 1
                patch = 0
            elif version_part == 'patch':
                patch += 1
            else:
                print("Invalid version part. Please specify 'major', 'minor', or 'patch'.")
                return

            # changes = get_git_changes_since_last_version(current_version, abs_package_path)
            all_changes = get_git_log_all(current_version)
            package_changes = get_git_log_for_package(current_version, abs_package_path)

            new_version = f"{major}.{minor}.{patch}"
            version_tag.text = new_version
            print(f"New version: {new_version}")

            tree.write('package.xml', encoding='utf-8', xml_declaration=True)
            with open('package.xml', 'a', encoding='utf-8') as xml_file:
                xml_file.write('\n')
            print("Version updated in package.xml.")

            update_package_json(new_version, current_version)
            update_changelog_md(new_version, all_changes)
            update_changelog_rst(new_version, package_changes)

        except ValueError:
            print("Error parsing the version.")

    finally:
        os.chdir(original_cwd)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Bump the version of a ROS package and update changelog files.'
    )
    parser.add_argument('package_path', type=str, help='Path to the package')
    parser.add_argument(
        'version_part',
        type=str,
        choices=['major', 'minor', 'patch'],
        help="Part of the version to increase: 'major', 'minor', or 'patch'"
    )

    args = parser.parse_args()
    bump_version(args.package_path, args.version_part)
