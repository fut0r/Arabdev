import { useQueryClient } from '@tanstack/react-query';

import { POST_QUERY_ROOTS } from '@/api/queryKeys';

export function useInvalidateModeration() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['moderation'] });
    POST_QUERY_ROOTS.forEach((root) => void queryClient.invalidateQueries({ queryKey: [root] }));
  };
}
