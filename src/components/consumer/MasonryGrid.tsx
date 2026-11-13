import { View, ScrollView, useWindowDimensions } from 'react-native';
import type { Article } from '@/types/article';
import { ArticleCard } from '@/components/consumer/ArticleCard';

interface MasonryGridProps {
  articles: Article[];
}

function getColumnCount(width: number): number {
  if (width >= 1024) return 3;
  if (width >= 768) return 2;
  return 1;
}

export function MasonryGrid({ articles }: MasonryGridProps) {
  const { width } = useWindowDimensions();
  const numColumns = getColumnCount(width);

  const columns: Article[][] = Array.from({ length: numColumns }, () => []);
  articles.forEach((article, index) => {
    columns[index % numColumns].push(article);
  });

  return (
    <ScrollView className="flex-1">
      <View className="w-full max-w-[1200px] self-center px-6 py-8">
        <View className="flex-row items-start gap-6">
          {columns.map((columnItems, colIndex) => (
            <View key={colIndex} className="flex-1 gap-6">
              {columnItems.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

