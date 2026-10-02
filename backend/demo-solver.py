"""OR-Tools CP-SAT set partitioning; JSON stdin/stdout keeps the local API portable."""
import json
import sys
from ortools.sat.python import cp_model


def solve(payload):
    participants = payload["participants"]
    candidates = payload["candidates"]
    tables = payload["tables"]
    if not isinstance(participants, int) or not 3 <= participants <= 24:
        raise ValueError("Participant count must be 3..24.")
    if not candidates:
        raise ValueError("No candidate groups were supplied.")
    for candidate in candidates:
        members = candidate["members"]
        if not 3 <= len(members) <= 5 or len(set(members)) != len(members):
            raise ValueError("Candidate group size or membership is invalid.")
        if any(not isinstance(member, int) or not 0 <= member < participants for member in members):
            raise ValueError("Candidate refers to an unknown participant.")

    plans, runs, previous = [], [], []
    termination_status = None
    candidate_lookup = {tuple(candidate['members']): index for index, candidate in enumerate(candidates)}
    lower, remainder = divmod(participants, tables)
    sizes = [lower + (index < remainder) for index in range(tables)]
    time_limit = min(12.0, max(0.1, float(payload.get("timeLimitSeconds", 8))))
    for rank in range(min(3, payload.get("topK", 3))):
        model = cp_model.CpModel()
        chosen = [model.new_bool_var(f"group_{index}") for index in range(len(candidates))]
        for member in range(participants):
            model.add_exactly_one([chosen[index] for index, candidate in enumerate(candidates) if member in candidate["members"]])
        model.add(sum(chosen) == tables)
        # A no-good constraint excludes the complete partition, not just a table order.
        for partition in previous:
            model.add(sum(chosen[index] for index in partition) <= tables - 1)
        utility = sum(int(round(candidate["score"])) * chosen[index] for index, candidate in enumerate(candidates))
        model.add(utility <= max(int(round(candidate['score'])) for candidate in candidates) * tables)
        if rank == 0:
            model.maximize(utility)
        elif rank == 1:
            minimum = model.new_int_var(0, 100, "minimum_group_quality")
            maximum = model.new_int_var(0, 100, "maximum_group_quality")
            for index, candidate in enumerate(candidates):
                score = int(round(candidate["score"]))
                model.add(minimum <= score + 100 * (1 - chosen[index]))
                model.add(maximum >= score * chosen[index])
            model.maximize(minimum * 3 * tables + utility - maximum * tables)
        else:
            earlier_pairs = set()
            for partition in previous:
                for index in partition:
                    members = candidates[index]["members"]
                    earlier_pairs.update((a, b) for offset, a in enumerate(members) for b in members[offset + 1:])
            novelty = []
            for candidate in candidates:
                members = candidate["members"]
                all_pairs = [(a, b) for offset, a in enumerate(members) for b in members[offset + 1:]]
                novelty.append(sum(pair not in earlier_pairs for pair in all_pairs))
            model.maximize(utility * 2 + sum(novelty[index] * 12 * chosen[index] for index in range(len(candidates))))
        # A valid deterministic warm start is only a hint: CP-SAT still optimizes all
        # scored candidate groups. Use a different partition for each no-good cut.
        hint = None
        for offset in range(participants):
            ordering = list(range(offset, participants)) + list(range(offset))
            cursor, seed = 0, []
            for size in sizes:
                key = tuple(sorted(ordering[cursor:cursor + size]))
                cursor += size
                if key not in candidate_lookup:
                    break
                seed.append(candidate_lookup[key])
            if len(seed) == tables and all(set(seed) != set(earlier) for earlier in previous):
                hint = set(seed)
                break
        if hint is not None:
            for index, variable in enumerate(chosen):
                model.add_hint(variable, 1 if index in hint else 0)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.num_search_workers = 4
        solver.parameters.random_seed = 909
        # This set-partitioning model is already small in its constraint dimension;
        # lengthy presolve can consume the entire demo budget before a warm start
        # reaches search. Keep all variables and search the original exact model.
        solver.parameters.cp_model_presolve = False
        status = solver.solve(model)
        status_name = solver.status_name(status)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if not plans:
                return {"plans": [], "runs": [], "status": status_name}
            termination_status = status_name
            break
        partition = [index for index, variable in enumerate(chosen) if solver.value(variable)]
        assignments = [member for index in partition for member in candidates[index]["members"]]
        if sorted(assignments) != list(range(participants)):
            raise ValueError("Solver assignment failed exact coverage verification.")
        previous.append(partition)
        plans.append({"candidateIndices": partition})
        runs.append({"status": status_name, "optimal": status == cp_model.OPTIMAL,
                     "wallTimeSeconds": solver.wall_time, "objective": solver.objective_value,
                     "bestBound": solver.best_objective_bound})
    optimal = all(run["optimal"] for run in runs) and termination_status in (None, "INFEASIBLE")
    return {"plans": plans, "runs": runs, "terminationStatus": termination_status,
            "status": "OPTIMAL" if optimal else "FEASIBLE"}


if __name__ == "__main__":
    try:
        json.dump(solve(json.load(sys.stdin)), sys.stdout)
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
