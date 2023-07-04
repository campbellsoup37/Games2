import h5py
import numpy as np
import os
import pandas as pd

def write_table(df, fname, path='/', mode='w'):
    fname_dir = fname.rsplit('/', 1)[0]
    os.makedirs(fname_dir, exist_ok=True)

    path = path.split('/')
    with h5py.File(fname, mode='a') as f:
        cursor = f
        for gname in path:
            if gname == '':
                continue
            if gname not in cursor:
                cursor.create_group(gname)
            cursor = cursor[gname]

        for cname in df:
            str_name = str(cname)
            if str_name in cursor:
                if mode == 'a':
                    cursor[str_name].resize(
                        size=(cursor[str_name].size + len(df[cname]),)
                    )
                else:
                    cursor[str_name].resize(
                        size=(len(df[cname]),)
                    )
                cursor[str_name][-len(df[cname]):] = df[cname].values
            else:
                cursor.create_dataset(
                    str_name, 
                    shape=(len(df[cname]),), 
                    data=df[cname].values, 
                    chunks=True, 
                    maxshape=(None,)
                )

def read_table(fname, path='/', usecols=None):
    dic = {}

    path = path.split('/')
    with h5py.File(fname, mode='r') as f:
        cursor = f
        for gname in path:
            if gname == '':
                continue
            cursor = cursor[gname]

        for cname in cursor.keys():
            dic[cname] = np.array(cursor[cname])

    return pd.DataFrame(dic)

def hls(fname, limit=10):
    def hls(g, level):
        text = ' ' * level + g.name
        if isinstance(g, h5py.Dataset):
            text += f' ({len(g)} {g.dtype})'
        print(text)
        if isinstance(g, h5py.Group):
            for i, k in enumerate(g):
                hls(g[k], level + 1)
                if i >= limit:
                    print(' ' * (level + 1) + '...')
                    break

    with h5py.File(fname, 'r') as f:
        hls(f, 0)

def hdiff(fname1, fname2):
    def hdiff(g1, g2, path):
        if isinstance(g1, h5py.Dataset):
            if len(g1) != len(g2):
                print(f'{path}: left and right have different sizes {len(g1)}, {len(g2)}')
            else:
                d = sum(np.array(g1) != np.array(g2))
                if d != 0:
                    print(f'{path}: left and right differ in {d} places')
        elif isinstance(g1, h5py.Group):
            for k in g1:
                if k not in g2:
                    print(f'{path}/{k}: missing from right')
            for k in g2:
                if k not in g1:
                    print(f'{path}/{k}: missing from left')
            for k in g1:
                if k in g2:
                    hdiff(g1[k], g2[k], f'{path}/{k}')

    with h5py.File(fname1, 'r') as f1:
        with h5py.File(fname2, 'r') as f2:
            hdiff(f1, f2, '')