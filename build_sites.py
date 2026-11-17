import os, shutil, zipfile

SRC = r'C:\Users\User\ia\kraken-app'
BASE = r'C:\Users\User\ia'
K = os.path.join(BASE, 'deploy-kraken')
A = os.path.join(BASE, 'deploy-admin')

def copy_contents(src, dst):
    for item in os.listdir(src):
        if item == '.git':
            continue
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        if os.path.isdir(s):
            if os.path.exists(d):
                shutil.rmtree(d)
            shutil.copytree(s, d)
        else:
            shutil.copy2(s, d)

copy_contents(SRC, K)

# Admin
shutil.rmtree(os.path.join(A, 'assets'), ignore_errors=True)
shutil.copytree(os.path.join(SRC, 'assets'), os.path.join(A, 'assets'))
shutil.copy2(os.path.join(SRC, 'admin.html'), os.path.join(A, 'index.html'))
shutil.copy2(os.path.join(SRC, 'admin-manifest.json'), os.path.join(A, 'admin-manifest.json'))

def zipdir(folder, zpath):
    if os.path.exists(zpath):
        os.remove(zpath)
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(folder):
            if '.git' in root:
                continue
            for f in files:
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, folder).replace(os.sep, '/'))
    return len(zipfile.ZipFile(zpath).namelist())

print('kraken entries', zipdir(K, os.path.join(BASE, 'kraken-site.zip')))
print('admin entries', zipdir(A, os.path.join(BASE, 'kraken-admin-site.zip')))
