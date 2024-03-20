# createdb.py
import pandas as pd
from langchain_community.document_loaders import DataFrameLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

DATA_PATH = 'data/TMDB_movie_dataset_v11.csv'
DB_FAISS_PATH = 'vectorstore/db_faiss'

df = pd.read_csv(DATA_PATH)

# Convert release_date to datetime
df['release_date'] = pd.to_datetime(df['release_date'])

# Filter movies released in and after 2021
df = df[df['release_date'].dt.year >= 2021]
df = df[df['vote_count'] > 10]

df['combined'] = df.apply(lambda row: f"""{row['genres']}""", axis=1)

loader = DataFrameLoader(df, page_content_column='combined')
docs = loader.load()

embeddings = HuggingFaceEmbeddings(
  model_name='sentence-transformers/all-MiniLM-L6-v2',
  model_kwargs={'device': 'cpu'}
)

db = FAISS.from_documents(docs, embeddings)
db.save_local(DB_FAISS_PATH)

# Summary reporting
print(f"Total documents processed: {len(docs)}")
print(f"Number of vectors in the DB: {db.index.ntotal}")

