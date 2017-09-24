import sys
from functools import partial

from deap.tools import cxTwoPoint, mutGaussian
from scoop import shared
from termcolor import colored

from conf import indpb, sigma, partitions, selectors
from evaluation import evaluate_zen, Andividual
from evolution import evolve
blue = partial(lambda text, color: colored(str(text), color), color='blue')
green = partial(lambda text, color: colored(str(text), color), color='green')


def main(instrument, days, popsize, strategy='trend_ema'):
    print(colored("Starting evolution....", 'blue'))
    evaluate = partial(evaluate_zen, days=days)
    print(blue("Evaluating ")+green(popsize)+blue(" individuals over ") + green(days) + blue(' days in ') + green(partitions) + blue(' partitions.'))
    Andividual.instruments = selectors[instrument]
    Andividual.mate = cxTwoPoint
    Andividual.mutate = partial(mutGaussian, mu=0, sigma=sigma, indpb=indpb)
    Andividual.strategy = strategy
    print(colored(f"Mating function is ", 'blue') + colored(Andividual.mate, 'green'))
    print(colored(f"Mutating function is ", 'blue') + colored(Andividual.mutate, 'green'))
    res = evolve(evaluate, Andividual, popsize)
    return res


if __name__ == '__main__':
    instrument = sys.argv[1]
    total_days = int(sys.argv[2])
    try:
        popsize = int(sys.argv[3])
    except:
        popsize = 10

    try:
        strategy = sys.argv[4]
    except:
        strategy = 'trend_ema'

    print ("{} {} {} {}".format(instrument, total_days, popsize, strategy))
    res = main(instrument, total_days, popsize, strategy)
    print(res)
