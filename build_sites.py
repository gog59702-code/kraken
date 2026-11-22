import os
import shutil
import zipfile

BASE = r"C:\Users\User\ia"
SRC = os.path.join(BASE, "kraken-app")
K = os.path.join(BASE, "deploy-kraken")
APP_ITEMS = ["index.html", "manifest.json", "sw.js", "assets"]
ADMIN_ITEMS = ["admin.html", "admin-manifest.json",
               os.path.join("assets", "js", "admin.js"),
               os.path.join("assets", "css", "admin.css")]


def drop_admin(folder):
    for rel in ADMIN_ITEMS:
        p = os.path.join(folder, rel)
        if os.path.isfile(p):
            os.remove(p)


def copy_tree(src, dst):
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def safe_copy(s, d):
    # copy2/copyfile2 échoue (WinError 87) sur certains fichiers du dossier ;
    # copie binaire simple puis métadonnées best-effort.
    shutil.copyfile(s, d)
    try:
        shutil.copystat(s, d)
    except OSError:
        pass


def copy_contents(src, dst):
    os.makedirs(dst, exist_ok=True)
    for item in os.listdir(src):
        if item == ".git":
            continue
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        if os.path.isdir(s):
            copy_tree(s, d)
        else:
            safe_copy(s, d)


# 1. source: no standalone admin anywhere
drop_admin(SRC)

# 2. mirror for the archive / local preview
copy_contents(SRC, K)
drop_admin(K)

# 3. repository root (GitHub Pages source)
for item in APP_ITEMS:
    s = os.path.join(SRC, item)
    d = os.path.join(BASE, item)
    if os.path.isdir(s):
        copy_tree(s, d)
    else:
        safe_copy(s, d)

# 4. remove the retired console artifacts
for rel in ADMIN_ITEMS:
    p = os.path.join(BASE, rel)
    if os.path.isfile(p):
        os.remove(p)
for folder in ["deploy-admin", "kraken-deploy-root"]:
    shutil.rmtree(os.path.join(BASE, folder), ignore_errors=True)
for z in ["kraken-admin-site.zip"]:
    p = os.path.join(BASE, z)
    if os.path.exists(p):
        os.remove(p)


def zipdir(folder, zpath):
    if os.path.exists(zpath):
        os.remove(zpath)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(folder):
            if ".git" in root:
                continue
            for f in files:
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, folder).replace(os.sep, "/"))
    return len(zipfile.ZipFile(zpath).namelist())


print("kraken entries", zipdir(K, os.path.join(BASE, "kraken-site.zip")))
print("done")
