import random

selectors = {
    'ETH-USDT': ['poloniex.ETH-USDT'],
}

partitions=2
selectivity = 0.3

runid=random.randint(1000,999999)
sigma = 20
indpb  = 0.3
mutpb = 0.3
cxpb = 0.3
