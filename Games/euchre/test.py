import multiprocessing as mp
import time

def target(conn):
    def func(x):
        time.sleep(5)
        return x ** 2
    x = conn.recv()
    x = func(x)
    conn.send(x)
    conn.close()
    
if __name__ == '__main__':
    parent_conn, child_conn = mp.Pipe()
    p = mp.Process(target=target, args=(child_conn,))
    p.start()
    parent_conn.send(33)
    while not parent_conn.poll():
        print('waiting...')
        time.sleep(1)
    import ipdb; ipdb.set_trace()
    print(parent_conn.recv())
    p.join()