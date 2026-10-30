import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceService } from "./provider";

export function useRpcQuery<T>(method: string, payload?: unknown, enabled = true) {
  const service = useWorkspaceService();
  const serializedPayload = JSON.stringify(payload ?? {});
  return useQuery({
    queryKey: ["rpc", method, serializedPayload],
    queryFn: () => service.call<T>(method, payload ?? {}),
    enabled,
    refetchOnWindowFocus: true,
  });
}

export function useRpcMutation<TInput, TResult>(method: string) {
  const service = useWorkspaceService();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => service.call<TResult>(method, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rpc"] }),
  });
}
