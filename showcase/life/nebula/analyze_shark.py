import os

def analyze_obj(path):
    min_v = [float('inf')] * 3
    max_v = [float('-inf')] * 3
    v_count = 0
    with open(path, 'r') as f:
        for line in f:
            if line.startswith('v '):
                v = [float(x) for x in line.split()[1:]]
                v_count += 1
                for i in range(3):
                    min_v[i] = min(min_v[i], v[i])
                    max_v[i] = max(max_v[i], v[i])
    print(f"Vertex Count: {v_count}")
    print(f"Min: {min_v}")
    print(f"Max: {max_v}")
    print(f"Center: {[(min_v[i]+max_v[i])/2 for i in range(3)]}")
    print(f"Size: {[max_v[i]-min_v[i] for i in range(3)]}")

analyze_obj(r'c:\Users\rolan\OneDrive\Desktop\hypercube\showcase\life\nebula\assets\shark.obj')
